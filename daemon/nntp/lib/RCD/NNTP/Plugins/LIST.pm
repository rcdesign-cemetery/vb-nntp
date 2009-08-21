#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::LIST;

    #
    #   LIST handler
    #

    use strict;
    use Exporter qw(import);
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.01"; # $Date: 2008/07/20 12:10:56 $

    our @EXPORT    = qw();
    our @EXPORT_OK = qw(GetGroupsList);


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'list' => 'cmd_list',
        };

      1;
    }


    #   ========================================================================
    #
    #     RFC 977
    #     http://www.faqs.org/rfcs/rfc977.html
    #
    #   ------------------------------------------------------------------------
    #
    #   3.6.  The LIST command
    #
    #     No input parameters.
    #
    #     Returns groups list with little info (one group per line):
    #
    #         group last first p
    #
    #     where
    #       <group>   is the name of the newsgroup
    #       <last>    is the number of the last known article currently
    #                 in that newsgroup
    #       <first>   is the number of the first article currently
    #                 in the newsgroup
    #       <p>       is either 'y' or 'n' indicating whether posting to this
    #                 newsgroup is allowed ('y') or prohibited ('n').
    #
    #     Responses:
    #
    #       215 list of newsgroups follows
    #


    sub cmd_list
    {
      my $self = shift;

      my ( $uuid ) = @_;

      if( $self->checkauth( $uuid ) )
      {
        #
        #   Update groups statistics
        #

        $self->GetGroupsList( $uuid );

        if( scalar keys %{ $self->client( $uuid )->{groupids} } )
        {
          $self->WriteClient(
              $uuid,
              '215 list of newsgroups follows'
            );

          my $isorted = {};

          foreach my $groupid ( keys %{ $self->client( $uuid )->{groupids} } )
          {
            my $group = $self->client( $uuid )->{groupids}->{ $groupid };
            $isorted->{ $group->{i} } = $groupid;
          }

          foreach my $i ( sort { $a <=> $b } keys %{ $isorted } )
          {
            my $groupid = $isorted->{ $i };
            my $group   = $self->client( $uuid )->{groupids}->{ $groupid };

            #
            #   Print group anounce
            #

            $self->WriteClient(
                $uuid,
                join( ' ',
                    $group->{name}  ,
                    $group->{last}  ,
                    $group->{first} ,
                    $group->{post}  ,
                  )
              );
          }

          $self->WriteClient(
              $uuid,
              '.'
            );
        }
        else
        {
          #
          #   server error, inform client
          #

          $self->WriteClient(
              $uuid,
              '503 program fault - command not performed'
            );
        }
      }

      return;
    }


    #
    #   Get groups list info
    #
    #   * We have array list of accessible by user groups ids cached in
    #     $self->client( $uuid )->{groupslist}
    #
    #   Input parameters:
    #     uuid - Connection ID
    #
    #   Returns nothing.
    #
    #   This sub calls from RCD::NNTP::Plugins::AUTHINFO::cachedauth to
    #   initialize groups info.
    #

    sub GetGroupsList ($)
    {
      my $self = shift;
      my $uuid = shift;

      $self->client( $uuid )->{groups}   = {};
      $self->client( $uuid )->{groupids} = {};

      if( $self->checkauth( $uuid ) )
      {
        #
        #   Just return if user have no accessible groups
        #
  
        return
          unless scalar( $self->client( $uuid )->{groupslist} );

        my $groups = $self->forum( $uuid )->do( {
            do            => 'groupslist',
            auth_ok       => 'yes',
            nntp_username => $self->client( $uuid )->{username},
            nntp_userid   => $self->client( $uuid )->{userid}  ,
            access        => $self->client( $uuid )->{access}  ,
          } );

        if( $groups && ref( $groups ) eq 'ARRAY' )
        {
          foreach my $group ( @{$groups} )
          {
            #
            #   Check and correct values if required
            #

            $group->{name}   =~ s/[ \s\t]//g;
            $group->{first} +=  0;
            $group->{last}  +=  0;
            $group->{post}   =  $group->{post} eq 'y' ? 'y' : 'n';
            $group->{id}    +=  0;

            #
            #   Cache group for current client
            #     for future access verification and other tasks
            #

            $self->client( $uuid )->{groups}->{ $group->{name} } = $group->{id};
            $self->client( $uuid )->{groupids}->{ $group->{id} } = $group;
          }
        }
      }

      return;
    }


# end of the RCD::NNTP::Plugins::LIST package

1;
