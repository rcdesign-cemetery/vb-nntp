#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::NEWGROUPS;

    #
    #   NEWGROUPS handler
    #

    use strict;
    use RCD::NNTP::Plugins::LIST qw(GetGroupsList);
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.02"; # $Date: 2009/11/03 16:59:05 $


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'newgroups' => 'cmd_newgroups',
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
    #   7.3.  The NEWGROUPS command
    #
    #   7.3.1.  NEWGROUPS
    #
    #     Input parameters:
    #
    #       <date> <time> [GMT]
    #
    #       A list of newsgroups created since <date and time> will be listed
    #       in the same format as the LIST command.
    #
    #       <date> is sent as 6/8 digits in the format yymmdd/yyyymmdd
    #       <time> is sent as 6 digits hhmmss
    #
    #       The time is assumed to be in the server's timezone unless the
    #       token "GMT" appears, in which case both time and date are evaluated
    #       at the 0 meridian.
    #
    #     Responses
    #
    #       231 list of new newsgroups follows
    #


    sub cmd_newgroups
    {
      my $self = shift;

      my ( $uuid, $date, $time, $gmt ) = @_;

      if( $self->check_conditions( $uuid ) )
      {
        my $date = $self->parse_date_time( $date, $time, $gmt );

        $self->WriteClient(
            $uuid,
            '231 list of newsgroups follows'
          );

        #
        #   Find new groups list within user accessible groups
        #

        if( scalar( $self->client( $uuid )->{groupslist} ) )
        {
          my $groups = $self->forum( $uuid )->do( {
              do            => 'newgroups',
              auth_ok       => 'yes',
              nntp_username => $self->client( $uuid )->{username},
              nntp_userid   => $self->client( $uuid )->{userid}  ,
              access        => $self->client( $uuid )->{access}  ,
              sdata         => { date => $date }
            } );
  
          if( $groups
              && ref( $groups ) eq 'ARRAY'
              && scalar( @{ $groups } ) > 0 )
          {
            #
            #   Save full list of accessible groups
            #

            my @fullgroupslist = @{ $self->client( $uuid )->{groupslist} };

            #
            #   Replace full groups list to new groups list
            #

            @{ $self->client( $uuid )->{groupslist} } = @{ $groups };

            #
            #   Get groups statistics
            #   Set 'no_clean' flag to '1' to skip cleaning existing groups data
            #

            $self->GetGroupsList( $uuid, 1 );

            #
            #   Restore full list of accessible groups
            #

            @{ $self->client( $uuid )->{groupslist} } = @fullgroupslist;

            #
            #   Sort groups list
            #

            my $isorted = {};
  
            foreach my $groupid ( @{ $groups } )
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
          }
        }

        $self->WriteClient(
            $uuid,
            '.'
          );
      }

      return;
    }


# end of the RCD::NNTP::Plugins::NEWGROUPS package

1;
