#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::GROUP;

    #
    #   GROUP handler
    #

    use strict;
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.02"; # $Date: 2009/11/02 15:45:10 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'group' => 'cmd_group',
        };

      1;
    }


    #   ========================================================================
    #
    #     RFC 3977
    #     http://www.faqs.org/rfcs/rfc3977.html
    #
    #   ------------------------------------------------------------------------
    #
    #   6.1.1.  GROUP
    #
    #     Input parameters:
    #
    #       <ggg> - the newsgroup name to be selected
    #
    #     Responses:
    #
    #       211 n f l s
    #               n = estimated number of articles in group,
    #               f = first article number in the group,
    #               l = last article number in the group,
    #               s = name of the group.)
    #       411 no such news group
    #


    sub cmd_group
    {
      my $self = shift;

      my ( $uuid,  $groupname ) = @_;

      if( $self->checkauth( $uuid ) )
      {
        #
        #   Check for existing group id
        #

        my $groupid = $self->client( $uuid )->{groups}->{ $groupname } || undef;

        #
        #   Verify if access to this group is granted to user
        #

        $groupid = undef
          unless $groupid && $self->client( $uuid )->{groupids}->{ $groupid };

        my $group;

        if( $groupid )
        {
          $group = $self->forum( $uuid )->do( {
              do            => 'groupinfo',
              auth_ok       => 'yes',
              nntp_username => $self->client( $uuid )->{username},
              nntp_userid   => $self->client( $uuid )->{userid}  ,
              access        => $self->client( $uuid )->{access}  ,
              groupname     => $groupname,
              ( defined $groupid ? ( groupid => $groupid ) : () ),
            } );
        }

        if( $groupid
            && $group
            && ref( $group ) eq 'HASH' )
        {
          #
          #   Check and correct values if required
          #

          $group->{name}   =~ s/[ \s\t]//g;
          $group->{first} +=  0;
          $group->{last}  +=  0;
          $group->{count} +=  0;
          $group->{id}    +=  0;

          #
          #   Print group anounce
          #

          $self->WriteClient(
              $uuid,
              join( ' ',
                  '211'           ,
                  $group->{count} ,
                  $group->{first} ,
                  $group->{last}  ,
                  $group->{name}  ,
                )
            );

          #
          #   Cache group for current client - убрать, ибо не нужно больше
          #

          $self->client( $uuid )->{groups} ||= {};
          $self->client( $uuid )->{groups}->{ $group->{name} } = $group->{id};

          #
          #   Save selected group id for current connection
          #

          $self->client( $uuid )->{groupid} = $group->{id};
        }
        elsif( $groupid
               && $group
               && ref( $group ) eq 'SCALAR'
               && $group eq 'no such news group' )
        {
          $self->WriteClient(
              $uuid,
              '411 no such news group'
            );
        }
        elsif( $groupid
               && $group
               && ref( $group ) eq 'SCALAR'
               && $group eq 'command syntax error' )
        {
          $self->WriteClient(
              $uuid,
              '501 command syntax error'
            );
        }
        elsif( $groupid )
        {
          #
          #   Server error, inform client
          #

          $self->WriteClient(
              $uuid,
              '503 program fault - command not performed'
            );
        }
        else
        {
          #
          #   No access to selected group
          #

          $self->WriteClient(
              $uuid,
              '411 no such news group'
            );
        }
      }

      return;
    }


# end of the RCD::NNTP::Plugins::GROUP package

1;
